import axios from 'axios';
import jwt from 'jsonwebtoken';
import { sql, getPool } from '../config/db.js';
import { getJwtSecret } from '../config/jwtSecret.js';

// Record one login attempt in Stock_LoginLog. Never stores the password.
// Failures here are logged only, so logging can never block a login.
const writeLoginLog = async (req, { username, empCode, role, status, reason }) => {
    try {
        const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        const ip = (forwarded || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
        await getPool().request()
            .input('username', sql.NVarChar, username ? String(username).toUpperCase().slice(0, 50) : null)
            .input('empCode', sql.NVarChar, empCode ? String(empCode).slice(0, 20) : null)
            .input('role', sql.NVarChar, role || null)
            .input('status', sql.NVarChar, status)
            .input('reason', sql.NVarChar, reason ? String(reason).slice(0, 255) : null)
            .input('ip', sql.NVarChar, ip ? ip.slice(0, 45) : null)
            .input('ua', sql.NVarChar, String(req.headers['user-agent'] || '').slice(0, 255) || null)
            .query(`INSERT INTO dbo.Stock_LoginLog (Username, EmpCode, Role, Status, Reason, IpAddress, UserAgent)
                    VALUES (@username, @empCode, @role, @status, @reason, @ip, @ua)`);
    } catch (e) {
        console.error('Login log error:', e.message);
    }
};

export const login = async (req, res) => {
    // Handle both body and query parameters (for URL login support)
    const body = req.body || {};
    const query = req.query || {};

    // Case-insensitive check
    const username = body.username || body.Username || query.username || query.Username;
    const password = body.password || body.Password || query.password || query.Password;

    if (!username || !password) {
        await writeLoginLog(req, { username, status: 'FAILED', reason: 'Missing username or password' });
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    try {
        const apiUrl = 'http://websrv01.dci.daikin.co.jp/BudgetCharts/BudgetRestService/api/authen';
        const response = await axios.get(apiUrl, {
            params: { username, password },
            timeout: 10000
        });

        if (response.data && response.status === 200) {
            // API returns array, get first element
            const apiData = Array.isArray(response.data) ? response.data[0] : response.data;

            // Check if we got valid data
            if (!apiData) {
                await writeLoginLog(req, { username, status: 'FAILED', reason: 'AD returned no user' });
                return res.status(401).json({ success: false, message: 'Invalid username or password' });
            }

            // Get user data - case-insensitive dynamic key search
            const keys = Object.keys(apiData);
            const codeKey = keys.find(k => k.toLowerCase() === 'empcode') || '';
            const nameKey = keys.find(k => ['shortname', 'empname'].includes(k.toLowerCase())) || '';
            // Specifically look for sect_short, fallback to sect only if not found (avoiding _CD or _Long)
            const sectKey = keys.find(k => k.toLowerCase() === 'sect_short') || keys.find(k => k.toLowerCase() === 'sect') || '';
            const picKey = keys.find(k => k.toLowerCase() === 'emppic') || '';

            const empCode = codeKey ? apiData[codeKey] : '';
            const shortName = nameKey ? apiData[nameKey] : '';
            const sect = sectKey ? apiData[sectKey] : '';
            const empPic = picKey ? apiData[picKey] : '';

            const ccKey = keys.find(k => k.toLowerCase() === 'cost_center') || '';
            const costCenter = ccKey ? String(apiData[ccKey]).trim() : '';

            console.log(`[Login] AD ok: ${String(username).toUpperCase()} EmpCode=${empCode || '-'} CC=${costCenter || '-'}`);

            // Validate that API returned actual user data
            if (!empCode && !shortName) {
                await writeLoginLog(req, { username, status: 'FAILED', reason: 'AD returned empty user data' });
                return res.status(401).json({ success: false, message: 'Invalid username or password' });
            }

            // [Restriction] Only Cost Center 7510 allowed
            if (costCenter !== '7510') {
                await writeLoginLog(req, { username, empCode, status: 'DENIED', reason: `Cost Center ${costCenter || 'N/A'}` });
                return res.status(403).json({
                    success: false,
                    message: `ขออภัย เฉพาะหน่วยงาน Cost Center 7510 เท่านั้นที่มีสิทธิ์เข้าใช้งานระบบ (Your CC: ${costCenter || 'N/A'})`
                });
            }

            if (!empCode) {
                await writeLoginLog(req, { username, status: 'DENIED', reason: 'No EmpCode from AD' });
                return res.status(403).json({ success: false, message: 'ไม่พบรหัสพนักงานจากข้อมูล AD' });
            }

            // Record user on every login (new users get 'Staff'); role is read from Stock_Users
            const pool = getPool();
            const upsert = await pool.request()
                .input('empCode', sql.NVarChar, String(empCode))
                .input('username', sql.NVarChar, String(username).toUpperCase())
                .input('name', sql.NVarChar, shortName || username)
                .input('sect', sql.NVarChar, sect ? String(sect) : null)
                .input('costCenter', sql.NVarChar, costCenter)
                .input('empPic', sql.NVarChar, empPic ? String(empPic).slice(0, 255) : null)
                .query(`
                    MERGE dbo.Stock_Users AS target
                    USING (SELECT @empCode AS EmpCode) AS src
                    ON target.EmpCode = src.EmpCode
                    WHEN MATCHED THEN
                        UPDATE SET Username = @username, Name = @name, Sect = @sect,
                                   CostCenter = @costCenter, EmpPic = COALESCE(@empPic, target.EmpPic),
                                   LastLoginAt = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (EmpCode, Username, Name, Sect, CostCenter, EmpPic, Role, FirstLoginAt, LastLoginAt)
                        VALUES (@empCode, @username, @name, @sect, @costCenter, @empPic, 'Staff', GETDATE(), GETDATE());
                    SELECT Role FROM dbo.Stock_Users WHERE EmpCode = @empCode;
                `);

            const role = upsert.recordset[0].Role;

            // Generate JWT
            const token = jwt.sign(
                {
                    username: String(username).toUpperCase(),
                    role: role,
                    name: shortName || username,
                    sect: sect,
                    empcode: empCode
                },
                getJwtSecret(),
                { expiresIn: '8h' }
            );

            await writeLoginLog(req, { username, empCode, role, status: 'SUCCESS' });

            res.json({
                success: true,
                token, // Send token for future use
                user: {
                    username: String(username).toUpperCase(),
                    role,
                    name: shortName || username,
                    sect: sect,
                    empcode: empCode,
                    empPic: empPic
                }
            });
        } else {
            await writeLoginLog(req, { username, status: 'FAILED', reason: `AD HTTP ${response.status}` });
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('AD Auth Error:', error.message);
        if (error.response) {
            await writeLoginLog(req, { username, status: 'FAILED', reason: `AD rejected (HTTP ${error.response.status})` });
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        await writeLoginLog(req, { username, status: 'ERROR', reason: error.message });
        res.status(500).json({ success: false, message: 'Authentication service unavailable' });
    }
};
