import { sql, getPool } from '../config/db.js';

// GET all BitLocker records
export const getBitlockerRecords = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT RecordID, EmployeeId, UserName, Hostname, 
                   DiskC_RecoveryKey, DiskD_RecoveryKey, SystemPIN,
                   Status, RecordedBy, Remark, CreatedAt, UpdatedAt
            FROM dbo.Stock_BitlockerKeys
            ORDER BY CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get BitLocker Records Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET single BitLocker record by ID
export const getBitlockerById = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('RecordID', sql.Int, req.params.id)
            .query(`
                SELECT * FROM dbo.Stock_BitlockerKeys WHERE RecordID = @RecordID
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get BitLocker By ID Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE BitLocker record
export const createBitlockerRecord = async (req, res) => {
    const { EmployeeId, UserName, Hostname, DiskC_RecoveryKey, DiskD_RecoveryKey, SystemPIN, RecordedBy, Remark } = req.body;

    if (!Hostname || !UserName) {
        return res.status(400).json({ error: 'Hostname and UserName are required' });
    }

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('EmployeeId', sql.NVarChar(50), EmployeeId || null)
            .input('UserName', sql.NVarChar(100), UserName)
            .input('Hostname', sql.NVarChar(100), Hostname)
            .input('DiskC_RecoveryKey', sql.NVarChar(500), DiskC_RecoveryKey || null)
            .input('DiskD_RecoveryKey', sql.NVarChar(500), DiskD_RecoveryKey || null)
            .input('SystemPIN', sql.NVarChar(50), SystemPIN || null)
            .input('RecordedBy', sql.NVarChar(100), RecordedBy || null)
            .input('Remark', sql.NVarChar(500), Remark || null)
            .query(`
                INSERT INTO dbo.Stock_BitlockerKeys
                (EmployeeId, UserName, Hostname, DiskC_RecoveryKey, DiskD_RecoveryKey, SystemPIN, Status, RecordedBy, Remark, CreatedAt, UpdatedAt)
                VALUES
                (@EmployeeId, @UserName, @Hostname, @DiskC_RecoveryKey, @DiskD_RecoveryKey, @SystemPIN, 1, @RecordedBy, @Remark, GETDATE(), GETDATE());
                SELECT SCOPE_IDENTITY() AS RecordID;
            `);
        res.json({ success: true, RecordID: result.recordset[0].RecordID });
    } catch (err) {
        console.error('Create BitLocker Record Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// UPDATE BitLocker record
export const updateBitlockerRecord = async (req, res) => {
    const { id } = req.params;
    const { EmployeeId, UserName, Hostname, DiskC_RecoveryKey, DiskD_RecoveryKey, SystemPIN, Status, RecordedBy, Remark } = req.body;

    try {
        const pool = getPool();
        await pool.request()
            .input('RecordID', sql.Int, id)
            .input('EmployeeId', sql.NVarChar(50), EmployeeId || null)
            .input('UserName', sql.NVarChar(100), UserName)
            .input('Hostname', sql.NVarChar(100), Hostname)
            .input('DiskC_RecoveryKey', sql.NVarChar(500), DiskC_RecoveryKey || null)
            .input('DiskD_RecoveryKey', sql.NVarChar(500), DiskD_RecoveryKey || null)
            .input('SystemPIN', sql.NVarChar(50), SystemPIN || null)
            .input('Status', sql.Bit, Status !== undefined ? Status : 1)
            .input('RecordedBy', sql.NVarChar(100), RecordedBy || null)
            .input('Remark', sql.NVarChar(500), Remark || null)
            .query(`
                UPDATE dbo.Stock_BitlockerKeys SET
                    EmployeeId = @EmployeeId,
                    UserName = @UserName,
                    Hostname = @Hostname,
                    DiskC_RecoveryKey = @DiskC_RecoveryKey,
                    DiskD_RecoveryKey = @DiskD_RecoveryKey,
                    SystemPIN = @SystemPIN,
                    Status = @Status,
                    RecordedBy = @RecordedBy,
                    Remark = @Remark,
                    UpdatedAt = GETDATE()
                WHERE RecordID = @RecordID
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Update BitLocker Record Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE BitLocker record
export const deleteBitlockerRecord = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        await pool.request()
            .input('RecordID', sql.Int, id)
            .query('DELETE FROM dbo.Stock_BitlockerKeys WHERE RecordID = @RecordID');
        res.json({ success: true });
    } catch (err) {
        console.error('Delete BitLocker Record Error:', err);
        res.status(500).json({ error: err.message });
    }
};
