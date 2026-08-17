import sql from 'mssql';
import { getHrmPool } from '../config/hrmDb.js';

// Helper: "NATTHAWUT" + "YODPRASERT" -> "NATTHAWUT.Y"
export const formatEmployeeName = (name, surname) => {
    const first = (name || '').trim();
    const lastInitial = (surname || '').trim().charAt(0).toUpperCase();
    if (!first) return '';
    return lastInitial ? `${first}.${lastInitial}` : first;
};

// GET /employees/:code
export const getEmployeeByCode = async (req, res) => {
    const { code } = req.params;

    if (!code || !code.trim()) {
        return res.status(400).json({ error: 'Employee code is required' });
    }

    let pool;
    try {
        pool = getHrmPool();
    } catch (err) {
        // HRM was never connected, or connectHrmDB() returned null at startup
        console.error('Get Employee Error: HRM pool unavailable -', err.message);
        return res.status(503).json({ error: 'ระบบค้นหาพนักงาน (HRM) ไม่พร้อมใช้งานในขณะนี้' });
    }

    try {
        const result = await pool.request()
            .input('Code', sql.VarChar, code.trim())
            .query(`
    SELECT TOP 1 [CODE], [NAME], [SURN], [COSTCENTER]
    FROM [dbHRM].[dbo].[Employee]
    WHERE [CODE] = @Code
`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'ไม่พบรหัสพนักงานนี้' });
        }

        const emp = result.recordset[0];
        const formattedName = formatEmployeeName(emp.NAME, emp.SURN);

        res.json({
    success: true,
    EmployeeCode: emp.CODE,
    FirstName: emp.NAME,
    LastName: emp.SURN,
    FormattedName: formattedName,
    CostCenter: emp.COSTCENTER,
});
    } catch (err) {
        console.error('Get Employee Error:', err.message);
        res.status(500).json({ error: 'Failed to look up employee' });
    }
};