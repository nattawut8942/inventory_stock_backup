import axios from 'axios';
import jwt from 'jsonwebtoken';
import { sql, getPool } from '../config/db.js';

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-this-in-env';

export const login = async (req, res) => {
    // Handle both body and query parameters (for URL login support)
    const body = req.body || {};
    const query = req.query || {};

    // Case-insensitive check
    const username = body.username || body.Username || query.username || query.Username;
    const password = body.password || body.Password || query.password || query.Password;

    if (!username || !password) {
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

            // Debug: Log what Daikin API returns
            console.log('=== Daikin API Response ===');
            console.log(JSON.stringify(apiData, null, 2));
            console.log('===========================');

            // Check if we got valid data
            if (!apiData) {
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

            // Validate that API returned actual user data
            if (!empCode && !shortName) {
                return res.status(401).json({ success: false, message: 'Invalid username or password' });
            }

            // [Restriction] Only Cost Center 7510 allowed
            if (costCenter !== '7510') {
                return res.status(403).json({
                    success: false,
                    message: `ขออภัย เฉพาะหน่วยงาน Cost Center 7510 เท่านั้นที่มีสิทธิ์เข้าใช้งานระบบ (Your CC: ${costCenter || 'N/A'})`
                });
            }

            // Check if user is admin from database
            const pool = getPool();
            const adminCheck = await pool.request()
                .input('username', sql.NVarChar, username.toLowerCase())
                .query('SELECT 1 FROM dbo.Stock_UserRole WHERE LOWER(Username) = @username');

            const isAdmin = adminCheck.recordset.length > 0;
            const role = isAdmin ? 'Staff' : 'User';

            // Generate JWT
            const token = jwt.sign(
                {
                    username: username,
                    role: role,
                    name: shortName || username,
                    sect: sect,
                    empcode: empCode
                },
                SECRET_KEY,
                { expiresIn: '8h' }
            );

            res.json({
                success: true,
                token, // Send token for future use
                user: {
                    username,
                    role,
                    name: shortName || username,
                    sect: sect,
                    empcode: empCode,
                    empPic: empPic
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('AD Auth Error:', error.message);
        if (error.response) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        res.status(500).json({ success: false, message: 'Authentication service unavailable' });
    }
};
