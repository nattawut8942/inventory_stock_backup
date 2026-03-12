import { sql, getPool } from '../config/db.js';

// GET all budget categories with allowed device types
export const getBudgetCategories = async (req, res) => {
    try {
        const pool = getPool();

        // Get categories
        const catResult = await pool.request().query(`
            SELECT CategoryID, CategoryCode, CategoryLabel, BudgetFormat, IsActive 
            FROM dbo.Stock_BudgetCategories
        `);

        // Get mappings
        const categories = await Promise.all(catResult.recordset.map(async (cat) => {
            const mapResult = await pool.request()
                .input('CategoryID', sql.Int, cat.CategoryID)
                .query(`
                    SELECT m.ID, m.TypeId, t.Label 
                    FROM dbo.Stock_BudgetDeviceTypes m
                    JOIN dbo.Stock_DeviceTypes t ON m.TypeId = t.TypeId
                    WHERE m.CategoryID = @CategoryID
                `);
            return {
                ...cat,
                AllowedDeviceTypes: mapResult.recordset
            };
        }));

        res.json(categories);
    } catch (err) {
        console.error('Get Budget Categories Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE new budget category
export const createBudgetCategory = async (req, res) => {
    const { CategoryCode, CategoryLabel, BudgetFormat, AllowedDeviceTypes } = req.body;
    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Insert Category
            const createReq = new sql.Request(transaction);
            const insertResult = await createReq
                .input('CategoryCode', sql.NVarChar, CategoryCode)
                .input('CategoryLabel', sql.NVarChar, CategoryLabel)
                .input('BudgetFormat', sql.NVarChar, BudgetFormat)
                .query(`
                    INSERT INTO dbo.Stock_BudgetCategories (CategoryCode, CategoryLabel, BudgetFormat, IsActive)
                    OUTPUT inserted.CategoryID
                    VALUES (@CategoryCode, @CategoryLabel, @BudgetFormat, 1)
                `);

            const newId = insertResult.recordset[0].CategoryID;

            // Insert Mappings (AllowedDeviceTypes should be an array of TypeId strings)
            if (AllowedDeviceTypes && AllowedDeviceTypes.length > 0) {
                for (const typeId of AllowedDeviceTypes) {
                    await new sql.Request(transaction)
                        .input('CategoryID', sql.Int, newId)
                        .input('TypeId', sql.VarChar, typeId)
                        .query(`
                            INSERT INTO dbo.Stock_BudgetDeviceTypes (CategoryID, TypeId)
                            VALUES (@CategoryID, @TypeId)
                        `);
                }
            }

            await transaction.commit();
            res.json({ success: true, message: 'Budget Category created successfully' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Create Budget Category Error:', err);
        // Duplicate check
        if (err.number === 2627) return res.status(409).json({ error: 'Duplicate Category Code' });
        res.status(500).json({ error: err.message });
    }
};

// UPDATE budget category
export const updateBudgetCategory = async (req, res) => {
    const { id } = req.params;
    const { CategoryCode, CategoryLabel, BudgetFormat, IsActive, AllowedDeviceTypes } = req.body;

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
                .input('CategoryID', sql.Int, id)
                .input('CategoryCode', sql.NVarChar, CategoryCode)
                .input('CategoryLabel', sql.NVarChar, CategoryLabel)
                .input('BudgetFormat', sql.NVarChar, BudgetFormat)
                .input('IsActive', sql.Bit, IsActive)
                .query(`
                    UPDATE dbo.Stock_BudgetCategories
                    SET CategoryCode = @CategoryCode,
                        CategoryLabel = @CategoryLabel,
                        BudgetFormat = @BudgetFormat,
                        IsActive = @IsActive
                    WHERE CategoryID = @CategoryID
                `);

            // Re-apply mappings: delete old ones, insert new ones
            await new sql.Request(transaction)
                .input('CategoryID', sql.Int, id)
                .query(`DELETE FROM dbo.Stock_BudgetDeviceTypes WHERE CategoryID = @CategoryID`);

            if (AllowedDeviceTypes && AllowedDeviceTypes.length > 0) {
                for (const typeId of AllowedDeviceTypes) {
                    await new sql.Request(transaction)
                        .input('CategoryID', sql.Int, id)
                        .input('TypeId', sql.VarChar, typeId)
                        .query(`
                            INSERT INTO dbo.Stock_BudgetDeviceTypes (CategoryID, TypeId)
                            VALUES (@CategoryID, @TypeId)
                        `);
                }
            }

            await transaction.commit();
            res.json({ success: true, message: 'Budget Category updated successfully' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Update Budget Category Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE budget category
export const deleteBudgetCategory = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Delete mappings first
            await new sql.Request(transaction)
                .input('CategoryID', sql.Int, id)
                .query(`DELETE FROM dbo.Stock_BudgetDeviceTypes WHERE CategoryID = @CategoryID`);

            // Delete category
            await new sql.Request(transaction)
                .input('CategoryID', sql.Int, id)
                .query(`DELETE FROM dbo.Stock_BudgetCategories WHERE CategoryID = @CategoryID`);

            await transaction.commit();
            res.json({ success: true, message: 'Budget Category deleted successfully' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Delete Budget Category Error:', err);
        res.status(500).json({ error: err.message });
    }
};
