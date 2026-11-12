import { sql, getPool } from '../config/db.js';

// ===== Stock_Users (auto-registered on login) =====
const VALID_ROLES = ['Staff', 'Admin'];

// GET /stock-users — list everyone who has logged in
export const getStockUsers = async (req, res) => {
    try {
        const result = await getPool().request().query(`
            SELECT ID, EmpCode, Username, Name, Sect, CostCenter, Role, FirstLoginAt, LastLoginAt
            FROM dbo.Stock_Users
            ORDER BY CASE WHEN Role = 'Admin' THEN 0 ELSE 1 END, LastLoginAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get stock users error:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /stock-users/:id/role  { Role } — Admin only
export const updateStockUserRole = async (req, res) => {
    const { id } = req.params;
    const { Role } = req.body || {};

    if (!VALID_ROLES.includes(Role)) {
        return res.status(400).json({ error: `Role ต้องเป็น ${VALID_ROLES.join(' หรือ ')}` });
    }

    try {
        const pool = getPool();
        const found = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT EmpCode, Role FROM dbo.Stock_Users WHERE ID = @id');
        const target = found.recordset[0];
        if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

        if (target.Role === 'Admin' && Role !== 'Admin') {
            if (String(target.EmpCode) === String(req.user?.empcode)) {
                return res.status(400).json({ error: 'ไม่สามารถลดสิทธิ์ Admin ของตัวเองได้' });
            }
            const admins = await pool.request()
                .query("SELECT COUNT(*) AS Cnt FROM dbo.Stock_Users WHERE Role = 'Admin'");
            if (admins.recordset[0].Cnt <= 1) {
                return res.status(400).json({ error: 'ต้องมี Admin อย่างน้อย 1 คน' });
            }
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('role', sql.NVarChar, Role)
            .query('UPDATE dbo.Stock_Users SET Role = @role WHERE ID = @id');

        res.json({ success: true, message: 'อัปเดตสิทธิ์สำเร็จ (มีผลเมื่อผู้ใช้ login ครั้งถัดไป)' });
    } catch (err) {
        console.error('Update stock user role error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /login-logs?status=&q=&days=&limit= — Admin only
const LOG_STATUSES = ['SUCCESS', 'FAILED', 'DENIED', 'ERROR'];
export const getLoginLogs = async (req, res) => {
    const status = String(req.query.status || '').toUpperCase();
    const q = String(req.query.q || '').trim();
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 500, 1), 2000);

    try {
        const request = getPool().request()
            .input('days', sql.Int, days)
            .input('limit', sql.Int, limit);
        let where = 'l.LoginAt >= DATEADD(DAY, -@days, GETDATE())';
        if (LOG_STATUSES.includes(status)) {
            request.input('status', sql.NVarChar, status);
            where += ' AND l.Status = @status';
        }
        if (q) {
            request.input('q', sql.NVarChar, `%${q}%`);
            where += ' AND (l.Username LIKE @q OR l.EmpCode LIKE @q OR u.Name LIKE @q OR l.IpAddress LIKE @q OR l.Reason LIKE @q)';
        }
        const result = await request.query(`
            SELECT TOP (@limit) l.ID, l.Username, l.EmpCode, u.Name, l.Role, l.Status, l.Reason,
                   l.IpAddress, l.UserAgent, l.LoginAt
            FROM dbo.Stock_LoginLog l
            LEFT JOIN dbo.Stock_Users u ON u.EmpCode = l.EmpCode
            WHERE ${where}
            ORDER BY l.LoginAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get login logs error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ===== Legacy: Stock_UserRole (no longer used for login; kept for reference) =====

// Get all admin users
export const getAdminUsers = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT ID, Username, EmpCode, CreatedAt, CreatedBy 
            FROM dbo.Stock_UserRole 
            ORDER BY CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get admin users error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Add new admin user
export const addAdminUser = async (req, res) => {
    const { username, empCode, createdBy } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const pool = getPool();
        await pool.request()
            .input('username', sql.NVarChar, username.toLowerCase())
            .input('empCode', sql.NVarChar, empCode || null)
            .input('createdBy', sql.NVarChar, createdBy || 'SYSTEM')
            .query(`
                INSERT INTO dbo.Stock_UserRole (Username, EmpCode, CreatedBy)
                VALUES (@username, @empCode, @createdBy)
            `);
        res.json({ success: true, message: 'Admin user added successfully' });
    } catch (err) {
        console.error('Add admin user error:', err);
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username or EmpCode already exists as admin' });
        }
        res.status(500).json({ error: err.message });
    }
};

// Update admin user
export const updateAdminUser = async (req, res) => {
    const { id } = req.params;
    const { Username, EmpCode } = req.body;

    if (!Username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('username', sql.NVarChar, Username)
            .input('empCode', sql.NVarChar, EmpCode || null)
            .query(`
                UPDATE dbo.Stock_UserRole 
                SET Username = @username, EmpCode = @empCode
                WHERE ID = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Admin user not found' });
        }

        res.json({ success: true, message: 'Admin user updated successfully' });
    } catch (err) {
        console.error('Update admin user error:', err);
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username or EmpCode already exists as admin' });
        }
        res.status(500).json({ error: err.message });
    }
};

// Delete admin user
export const deleteAdminUser = async (req, res) => {
    const { username } = req.params;

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('username', sql.NVarChar, username.toLowerCase())
            .query('DELETE FROM dbo.Stock_UserRole WHERE LOWER(Username) = @username');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Admin user not found' });
        }

        res.json({ success: true, message: 'Admin user removed successfully' });
    } catch (err) {
        console.error('Delete admin user error:', err);
        res.status(500).json({ error: err.message });
    }
};
