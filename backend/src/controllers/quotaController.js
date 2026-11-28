import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import ldap from 'ldapjs';
import dotenv from 'dotenv';
import { connectDB, getPool, sql } from '../config/db.js';
import { sendQuotaWarning, sendQuotaReport } from '../services/quotaEmailService.js';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwtSecret.js';
import { writeAuditEvent } from '../services/auditLogService.js';
import {
    getFilesFromLatestReport,
    isFsrmBusy, getFsrmQueueLength
} from '../services/fsrmReportService.js';
dotenv.config();

const execFileAsync = promisify(execFile);

const AD = {
    url: process.env.AD_URL || 'ldap://192.168.226.222:389',
    bindDN: process.env.AD_BIND_DN || 'dciadmin@dci.daikin.co.jp',
    bindPassword: process.env.AD_BIND_PASSWORD || '',
    baseDN: process.env.AD_BASE_DN || 'DC=dci,DC=daikin,DC=co,DC=jp',
};
const FSRM_SERVER = process.env.FSRM_SERVER || '192.168.226.223';
const FSRM_USER = process.env.FSRM_USER || 'dci\\dciadmin';
const FSRM_PASS = process.env.FSRM_PASS || '';

// ── Job store ─────────────────────────────────────────────────
const jobs = {};

const fmtBytes = (b) => {
    if (!b || b === 0) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${s[i]}`;
};
const pctStatus = p => p >= 100 ? 'Exceeded' : p >= 90 ? 'Critical' : p >= 80 ? 'Warning' : 'OK';
const parseUsername = s => { const m = s.match(/Name="([^"]+)"/); return m ? m[1] : s; };

// ── LDAP helpers ──────────────────────────────────────────────
const ldapConnect = () => new Promise((res, rej) => {
    const c = ldap.createClient({ url: AD.url, timeout: 5000, connectTimeout: 5000 });
    c.on('error', rej);
    c.bind(AD.bindDN, AD.bindPassword, err => err ? rej(err) : res(c));
});

const ldapSearch = (client, filter, attrs) => new Promise((res, rej) => {
    const rows = [];
    client.search(AD.baseDN, {
        filter,
        scope: 'sub',
        attributes: attrs,
        sizeLimit: 0,
        paged: { pageSize: 500 }
    }, (err, sr) => {
        if (err) return rej(err);

        sr.on('searchEntry', e => {
            // ✅ ใช้ e.object ที่เราเทสแล้วว่ามีข้อมูลแน่นอน
            const data = e.object;
            const o = {};

            // ✅ วนลูปเอาทุก Key มาทำให้เป็นตัวเล็ก (ป้องกันเรื่อง displayName vs displayname)
            Object.keys(data).forEach(key => {
                o[key.toLowerCase()] = data[key];
            });

            rows.push(o);
        });

        sr.on('error', e => {
            if (e.name === 'SizeLimitExceededError') res(rows);
            else rej(e);
        });

        sr.on('end', () => res(rows));
    });
});

const lookupEmails = async (usernames) => {
    const map = {};
    if (!usernames || !usernames.length) return map;

    const cleanedUsernames = usernames.map(u => u.split('\\').pop().trim().toLowerCase());
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < cleanedUsernames.length; i += chunkSize) {
        chunks.push(cleanedUsernames.slice(i, i + chunkSize));
    }

    try {
        const c = await ldapConnect();
        for (const batch of chunks) {
            const orPart = batch.map(u => `(sAMAccountName=${u})`).join('');
            const filter = `(&(objectClass=user)(objectCategory=person)(|${orPart}))`;
            const users = await ldapSearch(c, filter, ['sAMAccountName', 'mail', 'displayName']);

            if (users && users.length > 0) {
                users.forEach(u => {
                    // ✅ เรียกใช้ด้วยตัวเล็กทั้งหมด (ตามที่เรา Force ไว้ใน ldapSearch)
                    const sam = String(u.samaccountname || '').toLowerCase().trim();
                    const email = u.mail; // AD ส่ง mail (ตัวเล็ก) อยู่แล้ว
                    const displayName = u.displayname || sam; // ใช้ displayname (ตัวเล็ก)

                    if (sam && email) {
                        map[sam] = {
                            email: email,
                            displayName: displayName
                        };
                    }
                });
            }
        }
        await c.unbind();
        console.log(`[AD] Finished: Found ${Object.keys(map).length} emails.`);
    } catch (err) {
        console.warn('[AD] lookup error:', err.message);
    }
    return map;
};

// ── WinRM Disk Quota (async) ──────────────────────────────────
const fetchDiskQuota = async () => {
    const psFile = join(tmpdir(), `quota_${Date.now()}.ps1`);
    const script = [
        `$pass = ConvertTo-SecureString '${FSRM_PASS}' -AsPlainText -Force`,
        `$cred = New-Object System.Management.Automation.PSCredential('${FSRM_USER}', $pass)`,
        `$data = Invoke-Command -ComputerName ${FSRM_SERVER} -Credential $cred -ScriptBlock {`,
        `    Get-WmiObject -Class Win32_DiskQuota |`,
        `    Where-Object { $_.User -notlike '*Administrators*' -and $_.Limit -gt 0 } |`,
        `    Select-Object @{N='User';E={$_.User}},`,
        `                  @{N='DiskSpaceUsed';E={$_.DiskSpaceUsed}},`,
        `                  @{N='Limit';E={$_.Limit}},`,
        `                  @{N='WarningLimit';E={$_.WarningLimit}}`,
        `}`,
        `$data | ConvertTo-Json -Depth 2 -Compress`,
    ].join('\r\n');

    try {
        writeFileSync(psFile, script, 'utf8');
        const { stdout } = await execFileAsync(
            'powershell',
            [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden', // ✅ เพิ่มตัวนี้ใน Argument
                '-File', psFile
            ],
            {
                timeout: 300000,
                maxBuffer: 20 * 1024 * 1024,
                windowsHide: true // ✅ เพิ่มบรรทัดนี้เพื่อซ่อนหน้าต่างดำ (CMD/PowerShell)
            }
        );
        let data = JSON.parse(stdout.trim() || '[]');
        if (!Array.isArray(data)) data = [data];
        return data;
    } catch (err) {
        console.error('[WinRM] error:', err.message);
        return [];
    } finally {
        try { if (existsSync(psFile)) unlinkSync(psFile); } catch { }
    }
};

// ── DB helpers ────────────────────────────────────────────────
const buildListFromDB = async () => {
    try {
        const pool = await connectDB();
        const r = await pool.request().query(`
            SELECT Username,DisplayName,Email,SizeUsed,SizeLimit,WarningLevel,
                   PctUsed,Status,SizeUsedFmt,SizeLimitFmt,WarningFmt,LastSynced
            FROM Quota_Users ORDER BY PctUsed DESC
        `);
        return r.recordset.map(row => ({
            username: row.Username,
            name: row.DisplayName,
            email: row.Email,
            sizeUsed: row.SizeUsed,
            sizeLimit: row.SizeLimit,
            warningLevel: row.WarningLevel,
            pctUsed: parseFloat(row.PctUsed),
            status: row.Status,
            sizeUsedFmt: row.SizeUsedFmt,
            sizeLimitFmt: row.SizeLimitFmt,
            warningFmt: row.WarningFmt,
            lastSynced: row.LastSynced,
        }));
    } catch (err) {
        console.warn('[DB] buildListFromDB error:', err.message);
        return null;
    }
};

const saveQuotaToDB = async (list) => {
    const start = Date.now();
    try {
        const pool = await connectDB();
        for (const u of list) {
            await pool.request()
                .input('Username', sql.NVarChar, u.username)
                .input('DisplayName', sql.NVarChar, u.name || u.username)
                .input('Email', sql.NVarChar, u.email || null)
                .input('SizeUsed', sql.BigInt, u.sizeUsed || 0)
                .input('SizeLimit', sql.BigInt, u.limit || u.sizeLimit || 0)
                .input('WarningLevel', sql.BigInt, u.warningLevel || 0)
                .input('PctUsed', sql.Decimal, u.pctUsed || 0)
                .input('Status', sql.NVarChar, u.status || 'OK')
                .input('SizeUsedFmt', sql.NVarChar, u.sizeUsedFmt || '')
                .input('SizeLimitFmt', sql.NVarChar, u.sizeLimitFmt || '')
                .input('WarningFmt', sql.NVarChar, u.warningFmt || '')
                .query(`
                    MERGE Quota_Users AS t USING (SELECT @Username AS U) AS s ON t.Username = s.U
                    WHEN MATCHED THEN UPDATE SET
                        DisplayName = ISNULL(@DisplayName, t.DisplayName), 
                        Email = ISNULL(@Email, t.Email), 
                        SizeUsed = @SizeUsed, 
                        SizeLimit = @SizeLimit,
                        WarningLevel = @WarningLevel, 
                        PctUsed = @PctUsed, 
                        [Status] = @Status,
                        SizeUsedFmt = @SizeUsedFmt, 
                        SizeLimitFmt = @SizeLimitFmt, 
                        WarningFmt = @WarningFmt,
                        LastSynced = GETDATE()
                    WHEN NOT MATCHED THEN INSERT
                        (Username, DisplayName, Email, SizeUsed, SizeLimit, WarningLevel, PctUsed, [Status], SizeUsedFmt, SizeLimitFmt, WarningFmt, LastSynced)
                    VALUES (@Username, @DisplayName, @Email, @SizeUsed, @SizeLimit, @WarningLevel, @PctUsed, @Status, @SizeUsedFmt, @SizeLimitFmt, @WarningFmt, GETDATE());
                `);
        }
        await pool.request()
            .input('TotalUsers', sql.Int, list.length)
            .input('DurationMs', sql.Int, Date.now() - start)
            .input('Status', sql.NVarChar, 'success')
            .query(`INSERT INTO Quota_SyncLog (TotalUsers,DurationMs,Status) VALUES (@TotalUsers,@DurationMs,@Status)`);
        console.log(`[DB] Saved ${list.length} users in ${Date.now() - start}ms`);
    } catch (err) {
        console.error('[DB] saveQuotaToDB error:', err.message);
    }
};

// INSERT log → return ID
const insertEmailLog = async (u, status, filesFound = 0, errorMsg = null, reportFile = null, sentBy = null) => {
    try {
        const pool = await connectDB();
        const r = await pool.request()
            .input('Username', sql.NVarChar, u.username)
            .input('DisplayName', sql.NVarChar, u.name || u.username)
            .input('Email', sql.NVarChar, u.email || null)
            .input('PctUsed', sql.Decimal, u.pctUsed || 0)
            .input('SizeUsedFmt', sql.NVarChar, u.sizeUsedFmt || '')
            .input('SizeLimitFmt', sql.NVarChar, u.sizeLimitFmt || '')
            .input('FilesFound', sql.Int, filesFound)
            .input('Status', sql.NVarChar, status)
            .input('ErrorMsg', sql.NVarChar, errorMsg || null)
            .input('Step', sql.NVarChar, null)
            .input('ReportFile', sql.NVarChar, reportFile || null)
            .input('SentBy', sql.NVarChar, sentBy || null)  // ← เพิ่มบรรทัดนี้
            .query(`INSERT INTO Quota_EmailLog
                (Username,DisplayName,Email,PctUsed,SizeUsedFmt,SizeLimitFmt,FilesFound,Status,ErrorMsg,Step,ReportFile,SentBy)
                OUTPUT INSERTED.ID
                VALUES (@Username,@DisplayName,@Email,@PctUsed,@SizeUsedFmt,@SizeLimitFmt,@FilesFound,@Status,@ErrorMsg,@Step,@ReportFile,@SentBy)`);
        return r.recordset[0]?.ID;
    } catch (err) {
        console.warn('[DB] insertEmailLog error:', err.message);
        return null;
    }
};

// UPDATE log by ID (รองรับ step/progress)
const updateEmailLog = async (id, status, filesFound = 0, errorMsg = null, step = null, reportFile = null) => {
    if (!id) return;
    try {
        const pool = await connectDB();
        await pool.request()
            .input('ID', sql.Int, id)
            .input('Status', sql.NVarChar, status)
            .input('FilesFound', sql.Int, filesFound)
            .input('ErrorMsg', sql.NVarChar, errorMsg || null)
            .input('Step', sql.NVarChar, step || null)
            .input('ReportFile', sql.NVarChar, reportFile || null)
            .query(`UPDATE Quota_EmailLog SET Status=@Status, FilesFound=@FilesFound, ErrorMsg=@ErrorMsg,
                    Step=ISNULL(@Step, Step), ReportFile=ISNULL(@ReportFile, ReportFile) WHERE ID=@ID`);
    } catch (err) {
        console.warn('[DB] updateEmailLog error:', err.message);
    }
};

// backward compat
const saveEmailLog = (u, status, filesFound = 0, errorMsg = null) =>
    insertEmailLog(u, status, filesFound, errorMsg);

export const buildList = async (force = false) => {
    if (!force) {
        const dbList = await buildListFromDB();
        if (dbList?.length > 0) {
            console.log(`[Quota] From DB: ${dbList.length} users`);
            return dbList;
        }
    }
    console.log('[Quota] Fetching from WinRM (async)...');
    const raw = await fetchDiskQuota();
    const list = raw.map(q => {
        const username = parseUsername(q.User || '');
        const used = Number(q.DiskSpaceUsed || 0);
        const limit = Number(q.Limit || 0);
        const warn = Number(q.WarningLimit || 0);
        const pct = limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;
        return {
            username, name: username, email: null,
            sizeUsed: used, sizeLimit: limit, warningLevel: warn, pctUsed: pct,
            sizeUsedFmt: fmtBytes(used), sizeLimitFmt: fmtBytes(limit), warningFmt: fmtBytes(warn),
            status: pctStatus(pct)
        };
    });
    const adMap = await lookupEmails(list.map(u => u.username));
    list.forEach(u => {
        if (adMap[u.username]) { u.email = adMap[u.username].email; u.name = adMap[u.username].displayName || u.username; }
    });
    list.sort((a, b) => b.pctUsed - a.pctUsed);
    await saveQuotaToDB(list);
    return list;
};

// ════════════════════════════════════════════════════════════
//  CONTROLLERS
// ════════════════════════════════════════════════════════════

export const getQuotaUsers = async (req, res) => {
    try {
        const force = req.query.refresh === '1';
        const list = await buildList(force);
        const lastSynced = list[0]?.lastSynced || null;
        res.json({ success: true, count: list.length, data: list, lastSynced });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getQuotaStats = async (_req, res) => {
    try {
        const pool = await connectDB();
        const r = await pool.request().query(`
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN PctUsed>=100 THEN 1 ELSE 0 END) AS exceeded,
                   SUM(CASE WHEN PctUsed>=90 AND PctUsed<100 THEN 1 ELSE 0 END) AS critical,
                   SUM(CASE WHEN PctUsed>=80 AND PctUsed<90  THEN 1 ELSE 0 END) AS warning,
                   SUM(CASE WHEN PctUsed<80  THEN 1 ELSE 0 END) AS ok,
                   AVG(PctUsed) AS avg
            FROM Quota_Users`);
        const st = r.recordset[0];
        res.json({
            success: true, data: {
                total: st.total || 0, exceeded: st.exceeded || 0,
                critical: st.critical || 0, warning: st.warning || 0,
                ok: st.ok || 0, avg: Math.round(st.avg || 0),
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getEmailLogs = async (req, res) => {
    try {
        const pool = await connectDB();
        const limit = parseInt(req.query.limit) || 100;
        const r = await pool.request()
            .input('limit', sql.Int, limit)
            .query(`SELECT TOP (@limit) * FROM Quota_EmailLog ORDER BY SentAt DESC`);
        res.json({ success: true, count: r.recordset.length, data: r.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /quota/fsrm-status — เช็ค FSRM lock
export const getFsrmStatus = (_req, res) => {
    res.json({
        busy: isFsrmBusy(),
        queueSize: getFsrmQueueLength(),
    });
};

// POST /quota/sync
export const syncQuota = async (req, res) => {
    const jobId = `sync_${Date.now()}`;
    jobs[jobId] = { status: 'running', step: 'กำลังดึงข้อมูลจาก File Server...' };
    res.json({ success: true, jobId });
    (async () => {
        try {
            const list = await buildList(true);
            jobs[jobId] = { status: 'done', total: list.length, step: `Sync สำเร็จ ${list.length} รายการ` };
        } catch (err) {
            jobs[jobId] = { status: 'error', error: err.message };
        }
    })();
};

// per-user lock ป้องกัน double submit
const userLocks = new Set();

// POST /quota/send-warning-single
export const sendWarningSingle = async (req, res) => {
    const { user, sentBy } = req.body;  // ← เพิ่ม sentBy
    console.log('[Debug] sentBy:', sentBy);  // ← เพิ่มบรรทัดนี้
    if (!user?.email) return res.status(400).json({ success: false, error: 'user.email required' });

    // ถ้า user นี้กำลัง run อยู่แล้ว reject ทันที
    if (userLocks.has(user.username)) {
        return res.status(409).json({
            success: false,
            error: `${user.username} กำลัง run report อยู่ กรุณารอให้เสร็จก่อน`,
            locked: true,
        });
    }

    const jobId = `job_${Date.now()}`;
    jobs[jobId] = { status: 'running', username: user.username, step: 'รอ FSRM ว่าง...' };
    userLocks.add(user.username);

    // บันทึก log ทันทีที่เริ่ม — return logId กลับไปให้ frontend ใช้เป็น key
    const logId = await insertEmailLog(user, 'running', 0, null, null, sentBy);
    res.json({ success: true, jobId, logId });

    (async () => {
        // อัปเดต step ลง DB + memory พร้อมกัน
        const step = async (msg) => {
            jobs[jobId].step = msg;
            await updateEmailLog(logId, 'running', 0, null, msg);
        };
        try {
            await step('กำลัง Set FSRM Owner...');
            const result = await getFilesFromLatestReport(user.username, async (msg) => {
                jobs[jobId].step = msg;
                await updateEmailLog(logId, 'running', 0, null, msg);
            });
            const files = result.files ?? result;
            const reportFile = result.reportFile || null;
            const htmlBase64 = result.htmlBase64 || null;
            await step('กำลังส่งอีเมล...');
            console.log('[Debug] reportFile:', reportFile);
            console.log('[Debug] htmlBase64 length:', htmlBase64?.length || 0);
            await sendQuotaWarning(user, files, reportFile, htmlBase64);
            await updateEmailLog(logId, 'sent', files.length, null, '✅ ส่งสำเร็จ', reportFile);
            jobs[jobId] = {
                status: 'done', username: user.username, email: user.email,
                filesFound: files.length, step: `✅ ส่งสำเร็จ ${files.length} ไฟล์`,
                sentAt: new Date().toISOString(),
            };
        } catch (err) {
            console.error(`[Job ${jobId}] Error:`, err.message);
            await updateEmailLog(logId, 'error', 0, err.message, `❌ ${err.message}`);
            jobs[jobId] = { status: 'error', username: user.username, error: err.message, step: `❌ ${err.message}` };
        } finally {
            userLocks.delete(user.username);
        }
    })();
};

// POST /quota/send-warning — bulk (queue ตามลำดับ)
export const sendWarningEmails = async (req, res) => {
    const { users, sentBy } = req.body;  // ← เพิ่ม sentBy

    if (!users?.length) return res.status(400).json({ success: false, error: 'users required' });

    const jobId = `bulk_${Date.now()}`;
    jobs[jobId] = { status: 'running', total: users.length, sent: 0, failed: 0, current: '', results: [], step: '' };
    res.json({ success: true, jobId, total: users.length });

    // ทำงาน sequential — ทีละคน FSRM queue จัดการให้อัตโนมัติ
    (async () => {
        for (const u of users) {
            if (!u.email) {
                jobs[jobId].failed++;
                jobs[jobId].results.push({ username: u.username, status: 'no_email' });
                continue;
            }
            jobs[jobId].current = u.username;
            jobs[jobId].step = `กำลังส่งให้ ${u.name || u.username} (${jobs[jobId].sent + jobs[jobId].failed + 1}/${users.length})`;

            // INSERT log ทันทีที่เริ่ม → อัปเดต step ทุก progress
            const logId = await insertEmailLog(u, 'running', 0, null);
            const step = async (msg) => {
                jobs[jobId].step = msg;
                await updateEmailLog(logId, 'running', 0, null, msg);
            };

            try {
                await step(`กำลัง Set FSRM Owner...`);
                const result = await getFilesFromLatestReport(u.username, async (msg) => {
                    jobs[jobId].step = msg;
                    await updateEmailLog(logId, 'running', 0, null, msg);
                });
                const files = result.files ?? result;
                const reportFile = result.reportFile || null;
                const htmlBase64 = result.htmlBase64 || null;
                await step('กำลังส่งอีเมล...');
                await sendQuotaWarning(u, files, reportFile, htmlBase64);
                await updateEmailLog(logId, 'sent', files.length, null, '✅ ส่งสำเร็จ', reportFile);
                jobs[jobId].sent++;
                jobs[jobId].results.push({ username: u.username, status: 'sent', filesFound: files.length, logId });
            } catch (err) {
                await updateEmailLog(logId, 'error', 0, err.message, `❌ ${err.message}`);
                jobs[jobId].failed++;
                jobs[jobId].results.push({ username: u.username, status: 'error', error: err.message, logId });
            }
        }
        jobs[jobId].status = 'done';
        jobs[jobId].step = `✅ เสร็จสิ้น ${jobs[jobId].sent}/${users.length} คน`;
    })();
};

export const getJobStatus = (req, res) => {
    const job = jobs[req.params.id];
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, ...job });
};

// เรียกตอน server start เพื่อ cleanup logs ที่ค้างจาก crash/restart
export const cleanupStaleLogs = async () => {
    try {
        const pool = await connectDB();
        const r = await pool.request().query(`
            UPDATE Quota_EmailLog
            SET Status='error', ErrorMsg='Server restarted (interrupted)'
            WHERE Status='running' OR Status='pending'
        `);
        const affected = r.rowsAffected[0];
        if (affected > 0) console.log(`[Startup] Cleaned ${affected} stale running log(s)`);
    } catch (err) {
        console.warn('[Startup] cleanupStaleLogs error:', err.message);
    }
};

// POST /quota/reset-stale — manual reset จาก frontend
export const resetStaleLogs = async (_req, res) => {
    try {
        const pool = await connectDB();
        const r = await pool.request().query(`
            UPDATE Quota_EmailLog
            SET Status='error', ErrorMsg='Reset manually'
            WHERE Status='running' OR Status='pending'
        `);
        res.json({ success: true, affected: r.rowsAffected[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const sendReportEmail = async (req, res) => {
    const { recipients, summary } = req.body;  // ตัด data ออก
    if (!recipients?.length) return res.status(400).json({ success: false, error: 'recipients required' });
    try {
        // ดึง data จาก DB โดยตรง แทนรับจาก frontend
        const list = await buildList(false);
        await sendQuotaReport({ recipients, data: list, summary });
        res.json({ success: true, message: `Report sent to ${recipients.join(', ')}` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

// POST /quota/cancel/:jobId — ยกเลิก job
export const cancelJob = async (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const username = job.username || job.current;

    // cancel FSRM process
    if (username) {
        const { cancelJob: cancelFsrm } = await import('../services/fsrmReportService.js');
        cancelFsrm(username);
    }

    // อัปเดต job status
    jobs[jobId] = { ...job, status: 'cancelled', step: '🚫 ยกเลิกแล้ว' };

    // บันทึก email log ว่า cancelled
    if (username) {
        const u = job.username ? { username: job.username, name: job.username, email: job.email, pctUsed: 0, sizeUsedFmt: '', sizeLimitFmt: '' } : null;
        if (u) await saveEmailLog(u, 'cancelled', 0, 'ยกเลิกโดยผู้ใช้').catch(() => { });
    }

    userLocks.delete(username);
    res.json({ success: true, message: 'Cancelled' });
};

// GET /quota/log/:id — ดึง log รายการเดียว (frontend poll step)
export const getEmailLog = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        const r = await pool.request()
            .input('ID', sql.Int, parseInt(id))
            .query(`SELECT * FROM Quota_EmailLog WHERE ID = @ID`);
        if (!r.recordset.length)
            return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: r.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE /quota/log/:id — ลบ email log รายการ
export const deleteEmailLog = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        await pool.request()
            .input('ID', sql.Int, parseInt(id))
            .query(`DELETE FROM Quota_EmailLog WHERE ID = @ID`);
        res.json({ success: true, message: `Deleted log #${id}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE /quota/logs — ลบ email log ทั้งหมด (หรือเฉพาะ status)
export const clearEmailLogs = async (req, res) => {
    const { status } = req.query; // ?status=error หรือ ?status=all
    try {
        const pool = await connectDB();
        if (status && status !== 'all') {
            await pool.request()
                .input('Status', sql.NVarChar, status)
                .query(`DELETE FROM Quota_EmailLog WHERE Status = @Status`);
        } else {
            await pool.request().query(`DELETE FROM Quota_EmailLog`);
        }
        res.json({ success: true, message: 'Cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ════════════════════════════════════════════════════════════
//  ปรับขนาดโควต้า (NTFS Disk Quota ผ่าน WinRM)
// ════════════════════════════════════════════════════════════
const MB = 1024 * 1024;
// เพดานสูงสุดที่ตั้งได้จากหน้าเว็บ (กันกดพลาด) — ปรับได้ใน .env
// ขนาดสูงสุดต่อคน (ปัจจุบันมีผู้ใช้ที่ได้ 70 GB อยู่แล้ว) และเพิ่มได้ไม่เกินเท่านี้ต่อครั้ง (กันพิมพ์เลขเกิน)
const QUOTA_MAX_LIMIT_MB = Number(process.env.QUOTA_MAX_LIMIT_MB) || 100 * 1024;
const QUOTA_MAX_INCREASE_MB = Number(process.env.QUOTA_MAX_INCREASE_MB) || 10 * 1024;
const QUOTA_MIN_LIMIT_MB = 100;
const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

// ค่าทุกตัว (รหัสผ่าน, username, ตัวเลข) ส่งผ่าน environment / argument
// ไม่ต่อสตริงเข้าไปในสคริปต์ — กัน PowerShell injection
const SET_QUOTA_PS = [
    'param([string]$Server, [string]$User, [string]$Username, [string]$LimitBytes, [string]$WarnBytes, [string]$Apply, [string]$QuotaPath)',
    '$ErrorActionPreference = "Stop"',
    '$pass = ConvertTo-SecureString $env:QUOTA_WINRM_PASS -AsPlainText -Force',
    '$cred = New-Object System.Management.Automation.PSCredential($User, $pass)',
    '$out = Invoke-Command -ComputerName $Server -Credential $cred -ArgumentList $Username, $LimitBytes, $WarnBytes, $Apply, $QuotaPath -ScriptBlock {',
    '    param($u, $lim, $warn, $apply, $qpath)',
    '    $ErrorActionPreference = "Stop"',
    // ไล่อ่าน Win32_DiskQuota ทั้งหมดช้ามาก (ผู้ใช้หลายร้อยคน) → ทำครั้งเดียวตอนอ่าน
    // ตอนแก้ใช้ __PATH ที่ได้จากการอ่าน เปิด object ตรง ๆ
    '    if ($qpath) {',
    '        $q = [wmi]$qpath',
    '        if (-not $q -or $q.User -notlike (\'*Name="\' + $u + \'"\')) { throw "PATH_MISMATCH" }',
    '    } else {',
    '        $rows = @(Get-WmiObject -Class Win32_DiskQuota | Where-Object { $_.User -like (\'*Name="\' + $u + \'"\') -and $_.Limit -gt 0 })',
    '        if ($rows.Count -eq 0) { throw "NOT_FOUND" }',
    '        if ($rows.Count -gt 1) { throw "MULTI_VOLUME" }',
    '        $q = $rows[0]',
    '    }',
    '    $path = $q.__PATH',
    '    $before = [pscustomobject]@{ Volume = $q.QuotaVolume; Used = [int64]$q.DiskSpaceUsed; Limit = [int64]$q.Limit; Warning = [int64]$q.WarningLimit }',
    '    if ($apply -eq "1") {',
    '        $q.Limit = [uint64]$lim',
    '        $q.WarningLimit = [uint64]$warn',
    '        [void]$q.Put()',
    '        $q = [wmi]$path',
    '    }',
    '    $vol = ($before.Volume -replace \'.*DeviceID="([^"]+)".*\', \'$1\')',
    '    $disk = Get-WmiObject Win32_LogicalDisk -Filter ("DeviceID=\'" + $vol + "\'")',
    '    [pscustomobject]@{',
    '        Volume = $vol; Path = $path',
    '        Before = $before',
    '        After  = [pscustomobject]@{ Used = [int64]$q.DiskSpaceUsed; Limit = [int64]$q.Limit; Warning = [int64]$q.WarningLimit }',
    '        DiskSize = [int64]$disk.Size; DiskFree = [int64]$disk.FreeSpace',
    '    }',
    '}',
    '$out | Select-Object Volume, Path, Before, After, DiskSize, DiskFree | ConvertTo-Json -Depth 4 -Compress',
].join('\r\n');

const runSetQuota = async (username, limitBytes, warnBytes, apply, quotaPath = '') => {
    const psFile = join(tmpdir(), `quota_set_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ps1`);
    try {
        writeFileSync(psFile, SET_QUOTA_PS, 'utf8');
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', psFile,
            '-Server', FSRM_SERVER, '-User', FSRM_USER, '-Username', username,
            '-LimitBytes', String(limitBytes), '-WarnBytes', String(warnBytes), '-Apply', apply ? '1' : '0',
            '-QuotaPath', quotaPath || '',
        ], {
            // อ่านครั้งแรกต้องไล่ทุก quota (ช้าเท่าตอน Sync) · ตอนแก้เปิดตรงด้วย path จึงเร็ว
            timeout: quotaPath ? 120000 : 300000, windowsHide: true, maxBuffer: 1024 * 1024,
            env: { ...process.env, QUOTA_WINRM_PASS: FSRM_PASS },
        });
        return JSON.parse(stdout.trim());
    } catch (err) {
        const msg = String(err.stderr || err.message || '');
        if (msg.includes('NOT_FOUND')) throw Object.assign(new Error(`ไม่พบโควต้าของ ${username} บน File Server`), { status: 404 });
        if (err.killed) throw new Error('File Server ตอบช้าเกินกำหนด กรุณา Sync เพื่อตรวจว่าค่าเปลี่ยนแล้วหรือไม่');
        if (msg.includes('PATH_MISMATCH')) throw new Error('ข้อมูลโควต้าไม่ตรงกับผู้ใช้ ยกเลิกการแก้ไข');
        if (msg.includes('MULTI_VOLUME')) throw Object.assign(new Error(`${username} มีโควต้ามากกว่า 1 ไดรฟ์ ยังไม่รองรับ`), { status: 409 });
        throw new Error(`แก้โควต้าไม่สำเร็จ: ${msg.split('\n').find(l => l.trim()) || 'unknown error'}`);
    } finally {
        try { if (existsSync(psFile)) unlinkSync(psFile); } catch { }
    }
};

const quotaEditLocks = new Set();
// ผู้ใช้ที่สั่งงาน (route quota ไม่ได้ผ่าน authMiddleware จึงอ่านจาก token เอง)
const identifyActor = (req) => {
    if (req.user) return req.user;
    const raw = req.headers['authorization'];
    if (!raw) return null;
    try { return jwt.verify(raw.startsWith('Bearer ') ? raw.slice(7) : raw, getJwtSecret()); } catch { return null; }
};


// ── พื้นที่จริงของไดรฟ์ที่เก็บโควต้า ─────────────────────────
const QUOTA_VOLUME = /^[A-Za-z]:$/.test(process.env.QUOTA_VOLUME || '') ? process.env.QUOTA_VOLUME.toUpperCase() : 'E:';
const DISK_CACHE_MS = 10 * 60 * 1000;
let diskCache = null; // { size, free, at }

const DISK_PS = [
    'param([string]$Server, [string]$User, [string]$Volume)',
    '$ErrorActionPreference = "Stop"',
    '$pass = ConvertTo-SecureString $env:QUOTA_WINRM_PASS -AsPlainText -Force',
    '$cred = New-Object System.Management.Automation.PSCredential($User, $pass)',
    'Invoke-Command -ComputerName $Server -Credential $cred -ArgumentList $Volume -ScriptBlock {',
    '    param($v)',
    '    $d = Get-WmiObject Win32_LogicalDisk -Filter ("DeviceID=\'" + $v + "\'")',
    '    [pscustomobject]@{ Size = [int64]$d.Size; Free = [int64]$d.FreeSpace }',
    '} | Select-Object Size, Free | ConvertTo-Json -Compress',
].join('\r\n');

const fetchDiskInfo = async (force = false) => {
    if (!force && diskCache && Date.now() - diskCache.at < DISK_CACHE_MS) return diskCache;
    const psFile = join(tmpdir(), `quota_disk_${Date.now()}.ps1`);
    try {
        writeFileSync(psFile, DISK_PS, 'utf8');
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', psFile,
            '-Server', FSRM_SERVER, '-User', FSRM_USER, '-Volume', QUOTA_VOLUME,
        ], { timeout: 60000, windowsHide: true, env: { ...process.env, QUOTA_WINRM_PASS: FSRM_PASS } });
        const d = JSON.parse(stdout.trim());
        diskCache = { size: Number(d.Size), free: Number(d.Free), at: Date.now() };
        return diskCache;
    } finally {
        try { if (existsSync(psFile)) unlinkSync(psFile); } catch { }
    }
};

// ส่วนเผื่อจริง = พื้นที่ว่างบนดิสก์ − โควต้าที่แจกไปแล้วแต่ผู้ใช้ยังไม่ได้ใช้
// ถ้าขยายเกินส่วนนี้ เมื่อทุกคนใช้เต็มโควต้า ดิสก์จะเต็มก่อน (overcommit)
const computeCapacity = async (disk) => {
    const pool = await connectDB();
    const r = await pool.request().query(`
        SELECT COUNT(*) AS users,
               SUM(CAST(SizeLimit AS bigint)) AS allocated,
               SUM(CAST(SizeUsed AS bigint)) AS used,
               SUM(CASE WHEN SizeLimit > SizeUsed THEN CAST(SizeLimit - SizeUsed AS bigint) ELSE 0 END) AS unusedAllocated,
               MAX(LastSynced) AS lastSynced
        FROM Quota_Users`);
    const s = r.recordset[0] || {};
    const unusedAllocated = Number(s.unusedAllocated || 0);
    return {
        volume: QUOTA_VOLUME,
        users: s.users || 0,
        allocated: Number(s.allocated || 0),
        used: Number(s.used || 0),
        unusedAllocated,
        diskSize: disk?.size ?? null,
        diskFree: disk?.free ?? null,
        margin: disk ? disk.free - unusedAllocated : null,
        diskCheckedAt: disk?.at ? new Date(disk.at).toISOString() : null,
        lastSynced: s.lastSynced || null,
    };
};

// งานปรับโควต้า — ทำใน background (ใช้เวลาราว 2 นาที เพราะต้องไล่อ่านโควต้าทุกคน 1 รอบ)
const runExtendJob = async (jobId, { username, newLimitMB, newWarningMB, allowOvercommit, actor }) => {
    const started = Date.now();
    const step = (msg) => { jobs[jobId].step = msg; };
    let oldLimit = null;
    try {
        step('กำลังอ่านโควต้าปัจจุบันจาก File Server (ประมาณ 1–2 นาที)...');
        const cur = await runSetQuota(username, 0, 0, false);
        const used = Number(cur.Before.Used);
        oldLimit = Number(cur.Before.Limit);
        const oldWarn = Number(cur.Before.Warning);
        const limitBytes = newLimitMB * MB;
        if (limitBytes <= used) throw new Error(`ขนาดใหม่ต้องมากกว่าที่ใช้อยู่ (${fmtBytes(used)})`);
        if (limitBytes - oldLimit > QUOTA_MAX_INCREASE_MB * MB) throw new Error(`เพิ่มได้ไม่เกิน ${fmtBytes(QUOTA_MAX_INCREASE_MB * MB)} ต่อครั้ง`);

        // ตรวจพื้นที่ดิสก์จริง (ค่าพื้นที่ว่างได้มาพร้อมการอ่านรอบนี้ จึงเป็นค่าล่าสุด)
        diskCache = { size: Number(cur.DiskSize), free: Number(cur.DiskFree), at: Date.now() };
        const cap = await computeCapacity(diskCache);
        const increase = limitBytes - oldLimit;
        if (increase > 0 && increase > cap.margin && !allowOvercommit) {
            throw Object.assign(new Error(
                `พื้นที่ดิสก์จริงไม่พอ: ส่วนเผื่อเหลือ ${fmtBytes(Math.max(cap.margin, 0))} แต่ขอเพิ่ม ${fmtBytes(increase)} ` +
                '— ถ้ายืนยันจะทำให้โควต้ารวมเกินพื้นที่ว่างของดิสก์'), { code: 'OVERCOMMIT' });
        }

        // ไม่ระบุระดับเตือน = รักษาระยะห่างเดิมจากเพดาน (ค่าเริ่มต้นของเซิร์ฟเวอร์คือ 400 MB / เตือน 390 MB)
        let warnBytes = newWarningMB !== null ? newWarningMB * MB : limitBytes - Math.max(oldLimit - oldWarn, 0);
        if (warnBytes <= 0 || warnBytes > limitBytes) warnBytes = Math.floor(limitBytes * 0.9);

        step(`กำลังปรับ ${fmtBytes(oldLimit)} → ${fmtBytes(limitBytes)} (เตือน ${fmtBytes(warnBytes)})...`);
        const r = await runSetQuota(username, limitBytes, warnBytes, true, cur.Path);
        const after = { used: Number(r.After.Used), limit: Number(r.After.Limit), warning: Number(r.After.Warning) };
        if (after.limit !== limitBytes || after.warning !== warnBytes) throw new Error('ตั้งค่าแล้วแต่อ่านค่ากลับมาไม่ตรง กรุณา Sync เพื่อตรวจสอบ');
        diskCache = { size: Number(r.DiskSize), free: Number(r.DiskFree), at: Date.now() };

        // อัปเดตตาราง cache ให้หน้าเว็บเห็นทันทีโดยไม่ต้อง Sync ทั้งหมด
        const pct = Math.round((after.used / after.limit) * 1000) / 10;
        try {
            const pool = await connectDB();
            await pool.request()
                .input('Username', sql.NVarChar, username)
                .input('SizeUsed', sql.BigInt, after.used)
                .input('SizeLimit', sql.BigInt, after.limit)
                .input('WarningLevel', sql.BigInt, after.warning)
                .input('PctUsed', sql.Decimal(5, 1), pct)
                .input('Status', sql.NVarChar, pctStatus(pct))
                .input('SizeUsedFmt', sql.NVarChar, fmtBytes(after.used))
                .input('SizeLimitFmt', sql.NVarChar, fmtBytes(after.limit))
                .input('WarningFmt', sql.NVarChar, fmtBytes(after.warning))
                .query(`UPDATE Quota_Users SET SizeUsed=@SizeUsed, SizeLimit=@SizeLimit, WarningLevel=@WarningLevel,
                        PctUsed=@PctUsed, [Status]=@Status, SizeUsedFmt=@SizeUsedFmt, SizeLimitFmt=@SizeLimitFmt,
                        WarningFmt=@WarningFmt, LastSynced=GETDATE() WHERE Username=@Username`);
        } catch (err) {
            console.warn('[DB] extendQuota cache update error:', err.message);
        }

        const overcommitted = increase > 0 && increase > cap.margin;
        await writeAuditEvent({
            user: actor, module: 'quota', path: '/quota/extend', recordId: username,
            summary: `${username}: ${fmtBytes(oldLimit)} → ${fmtBytes(after.limit)} (เตือน ${fmtBytes(oldWarn)} → ${fmtBytes(after.warning)})${overcommitted ? ' (ยืนยันเกินพื้นที่ดิสก์)' : ''}`,
            durationMs: Date.now() - started,
            changes: {
                fields: [
                    { field: 'Limit', from: fmtBytes(oldLimit), to: fmtBytes(after.limit) },
                    { field: 'WarningLimit', from: fmtBytes(oldWarn), to: fmtBytes(after.warning) },
                ],
            },
        });
        console.log(`[Quota] ${actor?.username || '?'} set ${username} ${fmtBytes(oldLimit)} → ${fmtBytes(after.limit)} (warn ${fmtBytes(after.warning)})`);
        jobs[jobId] = {
            ...jobs[jobId], status: 'done', step: `✅ ${username}: ${fmtBytes(oldLimit)} → ${fmtBytes(after.limit)} (เตือน ${fmtBytes(after.warning)})`,
            result: {
                username, volume: r.Volume,
                before: { used, limit: oldLimit, warning: oldWarn },
                after,
                disk: { size: diskCache.size, free: diskCache.free },
            },
        };
    } catch (err) {
        jobs[jobId] = { ...jobs[jobId], status: 'error', error: err.message, code: err.code || null, step: `❌ ${err.message}` };
        if (err.code !== 'OVERCOMMIT' && oldLimit !== null) {
            await writeAuditEvent({
                user: actor, module: 'quota', path: '/quota/extend', recordId: username, success: false,
                summary: `${username}: ปรับเป็น ${newLimitMB} MB ไม่สำเร็จ — ${err.message}`, durationMs: Date.now() - started,
            });
        }
    } finally {
        quotaEditLocks.delete(username);
    }
};

// POST /quota/extend  { username, newLimitMB, newWarningMB?, allowOvercommit? }
// ตอบกลับทันทีด้วย jobId → หน้าเว็บ poll GET /quota/job/:id (ไม่ติด timeout ของ proxy)
export const extendQuota = async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const newLimitMB = Number(req.body?.newLimitMB);
    const allowOvercommit = req.body?.allowOvercommit === true;

    if (!USERNAME_RE.test(username)) return res.status(400).json({ success: false, error: 'username ไม่ถูกต้อง' });
    if (!Number.isInteger(newLimitMB) || newLimitMB < QUOTA_MIN_LIMIT_MB || newLimitMB > QUOTA_MAX_LIMIT_MB) {
        return res.status(400).json({ success: false, error: `ขนาดใหม่ต้องเป็นจำนวนเต็ม ${QUOTA_MIN_LIMIT_MB}–${QUOTA_MAX_LIMIT_MB} MB` });
    }
    let newWarningMB = req.body?.newWarningMB;
    if (newWarningMB !== undefined && newWarningMB !== null && newWarningMB !== '') {
        newWarningMB = Number(newWarningMB);
        if (!Number.isInteger(newWarningMB) || newWarningMB < 1 || newWarningMB > newLimitMB) {
            return res.status(400).json({ success: false, error: 'ระดับเตือนต้องเป็นจำนวนเต็ม และไม่เกินขนาดใหม่' });
        }
    } else newWarningMB = null;

    if (quotaEditLocks.has(username)) return res.status(409).json({ success: false, error: `${username} กำลังถูกปรับโควต้าอยู่ กรุณารอให้เสร็จก่อน` });
    quotaEditLocks.add(username);

    const jobId = `extend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    jobs[jobId] = { status: 'running', type: 'extend', username, newLimitMB, step: 'เริ่มงาน...' };
    // log ของ request นี้ (ผู้ขอ + ขนาดที่ขอ) — ผลจริง (ค่าเดิม → ค่าใหม่) บันทึกแยกเมื่องานเสร็จ
    res.locals.auditSummary = `${username}: ขอปรับเป็น ${newLimitMB} MB${newWarningMB !== null ? ` · เตือน ${newWarningMB} MB` : ''}${allowOvercommit ? ' (ยืนยันเกินพื้นที่ดิสก์)' : ''}`;
    res.json({ success: true, jobId });

    const actor = identifyActor(req);
    runExtendJob(jobId, { username, newLimitMB, newWarningMB, allowOvercommit, actor });
};

// GET /quota/capacity[?refresh=1] — พื้นที่จริงของไดรฟ์เทียบกับโควต้าที่แจกไปแล้ว
export const getQuotaCapacity = async (req, res) => {
    let disk = null, diskError = null;
    try { disk = await fetchDiskInfo(req.query.refresh === '1'); }
    catch (err) { diskError = 'อ่านพื้นที่ดิสก์จาก File Server ไม่สำเร็จ'; console.warn('[Quota] disk info error:', err.message); }
    try {
        const cap = await computeCapacity(disk);
        res.json({ success: true, data: { ...cap, diskError, maxLimitMB: QUOTA_MAX_LIMIT_MB, maxIncreaseMB: QUOTA_MAX_INCREASE_MB } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getSyncLogs = async (_req, res) => {
    try {
        const pool = await connectDB();
        const r = await pool.request().query(
            `SELECT TOP 20 * FROM Quota_SyncLog ORDER BY SyncedAt DESC`
        );
        res.json({ success: true, data: r.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};