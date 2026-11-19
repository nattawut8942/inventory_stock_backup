import { sql, connectDB } from '../config/db.js';

// Get all reasons
export const getReasons = async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT * FROM dbo.Stock_WithdrawalReasons ORDER BY TypeId, Label");
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching reasons:', err);
        res.status(500).json({ error: 'Failed to fetch reasons' });
    }
};

// ตรวจชื่อซ้ำในประเภทเดียวกัน (ไม่สนช่องว่างและตัวพิมพ์)
const findDuplicate = async (pool, label, typeId, excludeId) => {
    const r = await pool.request()
        .input('Label', sql.NVarChar, label)
        .input('TypeId', sql.VarChar, typeId || null)
        .input('ExcludeId', sql.Int, excludeId || 0)
        .query("SELECT TOP 1 ReasonID, Label FROM dbo.Stock_WithdrawalReasons WHERE LOWER(REPLACE(Label, ' ', '')) = LOWER(REPLACE(@Label, ' ', '')) AND ISNULL(TypeId, '') = ISNULL(@TypeId, '') AND ReasonID <> @ExcludeId");
    return r.recordset[0] || null;
};

// Add a new reason
export const addReason = async (req, res) => {
    const { label, typeId } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });

    try {
        const pool = await connectDB();
        const dup = await findDuplicate(pool, label, typeId, 0);
        if (dup) return res.status(409).json({ error: `มีเหตุผล "${dup.Label}" อยู่แล้วในประเภทนี้` });
        await pool.request()
            .input('Label', sql.NVarChar, label)
            .input('TypeId', sql.VarChar, typeId || null)
            .query("INSERT INTO dbo.Stock_WithdrawalReasons (Label, TypeId) VALUES (@Label, @TypeId)");

        res.status(201).json({ message: 'Reason added successfully' });
    } catch (err) {
        console.error('Error adding reason:', err);
        res.status(500).json({ error: 'Failed to add reason' });
    }
};

// Update a reason
export const updateReason = async (req, res) => {
    const { id } = req.params;
    const { label, typeId, isActive } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });

    try {
        const pool = await connectDB();
        const dup = await findDuplicate(pool, label, typeId, Number(id));
        if (dup) return res.status(409).json({ error: `มีเหตุผล "${dup.Label}" อยู่แล้วในประเภทนี้` });
        await pool.request()
            .input('ReasonID', sql.Int, id)
            .input('Label', sql.NVarChar, label)
            .input('TypeId', sql.VarChar, typeId || null)
            .input('IsActive', sql.Bit, isActive === false ? 0 : 1)
            .query("UPDATE dbo.Stock_WithdrawalReasons SET Label = @Label, TypeId = @TypeId, IsActive = @IsActive WHERE ReasonID = @ReasonID");

        res.json({ message: 'Reason updated successfully' });
    } catch (err) {
        console.error('Error updating reason:', err);
        res.status(500).json({ error: 'Failed to update reason' });
    }
};

// Delete a reason
export const deleteReason = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        // ไม่ลบจริง: ปิดการใช้งาน (ประวัติเดิมยังอ้างอิงชื่อเหตุผลได้)
        await pool.request()
            .input('ReasonID', sql.Int, id)
            .query("UPDATE dbo.Stock_WithdrawalReasons SET IsActive = 0 WHERE ReasonID = @ReasonID");

        res.json({ message: 'Reason deactivated' });
    } catch (err) {
        console.error('Error deleting reason:', err);
        res.status(500).json({ error: 'Failed to delete reason' });
    }
};
