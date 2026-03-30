import { sql, getPool } from '../config/db.js';

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
