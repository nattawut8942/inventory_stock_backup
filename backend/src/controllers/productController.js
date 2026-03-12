import { sql, getPool } from '../config/db.js';

// Helper for Thai Date
const getThaiDate = () => new Date();

export const uploadImage = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl });
};

// --- PRODUCTS ---

// GET All Products
export const getProducts = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT ProductID, ProductName, DeviceType, MinStock, MaxStock, CurrentStock, LastPrice, UnitOfMeasure, IsActive, ImageURL, Location, BarcodeID
            FROM dbo.Stock_Products
            WHERE IsActive = 1
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// UPDATE Product
export const updateProduct = async (req, res) => {
    const { id } = req.params;
    const { ProductName, DeviceType, LastPrice, CurrentStock, MinStock, MaxStock, ImageURL, Location, BarcodeID } = req.body;

    try {
        const pool = getPool();
        const request = pool.request();

        request.input('ProductID', sql.Int, id)
            .input('ProductName', sql.NVarChar, ProductName)
            .input('DeviceType', sql.VarChar, DeviceType)
            .input('MinStock', sql.Int, MinStock)
            .input('MaxStock', sql.Int, MaxStock || 0)
            .input('CurrentStock', sql.Int, CurrentStock)
            .input('LastPrice', sql.Decimal(18, 2), LastPrice);

        let query = `
            UPDATE dbo.Stock_Products 
            SET ProductName = @ProductName, DeviceType = @DeviceType, 
                MinStock = @MinStock, MaxStock = @MaxStock, CurrentStock = @CurrentStock, LastPrice = @LastPrice
        `;

        if (ImageURL !== undefined) {
            request.input('ImageURL', sql.NVarChar, ImageURL);
            query += `, ImageURL = @ImageURL`;
        }

        if (Location !== undefined) {
            request.input('Location', sql.NVarChar, Location);
            query += `, Location = @Location`;
        }

        if (BarcodeID !== undefined) {
            request.input('BarcodeID', sql.NVarChar, BarcodeID);
            query += `, BarcodeID = @BarcodeID`;
        }

        query += ` WHERE ProductID = @ProductID`;

        await request.query(query);
        res.json({ success: true });
    } catch (err) {
        console.error('Update Product Error:', err);
        res.status(500).json({ error: 'Failed to update product' });
    }
};

// DELETE Product (Soft Delete)
export const deleteProduct = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = getPool();
        await pool.request()
            .input('ProductID', sql.Int, id)
            .query('UPDATE dbo.Stock_Products SET IsActive = 0 WHERE ProductID = @ProductID');

        res.json({ success: true });
    } catch (err) {
        console.error('Delete Product Error:', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
};

// MANUAL IMPORT
export const manualImport = async (req, res) => {
    const { ProductName, DeviceType, LastPrice, CurrentStock, MinStock, MaxStock, Remark, UserID, Location } = req.body;

    const qty = parseInt(CurrentStock) || 0;
    const unitCost = parseFloat(LastPrice) || 0;
    const minStock = parseInt(MinStock) || 0;
    const maxStock = parseInt(MaxStock) || 0;

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Check if product exists
            let productID;
            const checkRes = await new sql.Request(transaction)
                .input('ProductName', sql.NVarChar, ProductName.trim())
                .query('SELECT ProductID FROM dbo.Stock_Products WHERE ProductName = @ProductName');

            if (checkRes.recordset.length > 0) {
                // Update Existing Product
                productID = checkRes.recordset[0].ProductID;
                await new sql.Request(transaction)
                    .input('ProductID', sql.Int, productID)
                    .input('Qty', sql.Int, qty)
                    .input('UnitCost', sql.Decimal(18, 2), unitCost)
                    .input('MinStock', sql.Int, minStock)
                    .input('MaxStock', sql.Int, maxStock)
                    .input('Location', sql.NVarChar, Location || null)
                    .query(`
                        UPDATE dbo.Stock_Products 
                        SET CurrentStock = CurrentStock + @Qty,
                            LastPrice = @UnitCost,
                            MinStock = @MinStock,
                            MaxStock = @MaxStock,
                            Location = COALESCE(@Location, Location),
                            IsActive = 1
                        WHERE ProductID = @ProductID
                    `);
            } else {
                // Create New Product
                const insertRes = await new sql.Request(transaction)
                    .input('ProductName', sql.NVarChar(255), ProductName.trim())
                    .input('DeviceType', sql.VarChar(50), DeviceType || null)
                    .input('CurrentStock', sql.Int, qty)
                    .input('UnitCost', sql.Decimal(18, 2), unitCost)
                    .input('MinStock', sql.Int, minStock)
                    .input('MaxStock', sql.Int, maxStock)
                    .input('Location', sql.NVarChar(100), Location || null)
                    .query(`
                        INSERT INTO dbo.Stock_Products 
                            (ProductName, DeviceType, CurrentStock, LastPrice, MinStock, MaxStock, Location, IsActive)
                        OUTPUT INSERTED.ProductID
                        VALUES (@ProductName, @DeviceType, @CurrentStock, @UnitCost, @MinStock, @MaxStock, @Location, 1)
                    `);
                productID = insertRes.recordset[0].ProductID;
            }


            // 2. Log Transaction
            const now = getThaiDate();
            await new sql.Request(transaction)
                .input('ProductID', sql.Int, productID)
                .input('TransType', sql.VarChar, 'IN')
                .input('Qty', sql.Int, qty)
                .input('RefInfo', sql.NVarChar, Remark || 'Manual Import')
                .input('UserID', sql.NVarChar, UserID)
                .input('TransDate', sql.DateTime, now)
                .query(`
                    INSERT INTO dbo.Stock_Transactions (ProductID, TransType, Qty, RefInfo, UserID, TransDate)
                    VALUES (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate)
                `);

            await transaction.commit();
            res.json({ success: true, message: 'Import successful' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Manual Import Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// WITHDRAW (Outbound)
export const withdrawProduct = async (req, res) => {
    const { ProductID, Qty, UserID, RefInfo } = req.body;

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const checkStock = await new sql.Request(transaction)
                .input('ProductID', sql.Int, ProductID)
                .query('SELECT CurrentStock FROM dbo.Stock_Products WHERE ProductID = @ProductID');

            if (checkStock.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Product not found' });
            }

            const currentStock = checkStock.recordset[0].CurrentStock;
            if (currentStock < Qty) {
                await transaction.rollback();
                return res.status(400).json({ error: 'Insufficient stock' });
            }

            await new sql.Request(transaction)
                .input('ProductID', sql.Int, ProductID)
                .input('Qty', sql.Int, Qty)
                .query('UPDATE dbo.Stock_Products SET CurrentStock = CurrentStock - @Qty WHERE ProductID = @ProductID');

            const now = getThaiDate();
            await new sql.Request(transaction)
                .input('ProductID', sql.Int, ProductID)
                .input('TransType', sql.VarChar, 'OUT')
                .input('Qty', sql.Int, Qty)
                .input('RefInfo', sql.NVarChar, RefInfo || 'Internal Withdrawal')
                .input('UserID', sql.NVarChar, UserID)
                .input('TransDate', sql.DateTime, now)
                .query(`
                    INSERT INTO dbo.Stock_Transactions (ProductID, TransType, Qty, RefInfo, UserID, TransDate)
                    VALUES (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate)
                `);

            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Withdraw Error:', err);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
};

// --- DEVICE TYPES ---

// GET Device Types
export const getDeviceTypes = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query('SELECT TypeId, Label FROM dbo.Stock_DeviceTypes');
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Types Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE Device Type
export const createDeviceType = async (req, res) => {
    const { TypeId, Label } = req.body;
    if (!TypeId || !Label) {
        return res.status(400).json({ error: 'TypeId and Label are required' });
    }
    try {
        const pool = getPool();
        await pool.request()
            .input('TypeId', sql.VarChar, TypeId)
            .input('Label', sql.NVarChar, Label)
            .query('INSERT INTO dbo.Stock_DeviceTypes (TypeId, Label) VALUES (@TypeId, @Label)');
        res.json({ success: true, message: 'Type added' });
    } catch (err) {
        console.error('Add Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// UPDATE Device Type
export const updateDeviceType = async (req, res) => {
    const { id } = req.params;
    const { Label } = req.body;
    try {
        const pool = getPool();
        await pool.request()
            .input('TypeId', sql.VarChar, id)
            .input('Label', sql.NVarChar, Label)
            .query('UPDATE dbo.Stock_DeviceTypes SET Label = @Label WHERE TypeId = @TypeId');
        res.json({ success: true });
    } catch (err) {
        console.error('Update Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE Device Type
export const deleteDeviceType = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        // Check usage first
        const check = await pool.request()
            .input('TypeId', sql.VarChar, id)
            .query('SELECT TOP 1 1 FROM dbo.Stock_Products WHERE DeviceType = @TypeId');

        if (check.recordset.length > 0) {
            return res.status(400).json({ error: 'Type is in use by products' });
        }

        await pool.request()
            .input('TypeId', sql.VarChar, id)
            .query('DELETE FROM dbo.Stock_DeviceTypes WHERE TypeId = @TypeId');
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// --- FORECAST ---
export const getForecast = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT 
                ProductID, ProductName, DeviceType, MinStock, MaxStock, CurrentStock, LastPrice,
                CASE WHEN CurrentStock <= MinStock THEN ISNULL(MaxStock, MinStock) - CurrentStock ELSE 0 END as OrderQty,
                CASE WHEN CurrentStock <= MinStock THEN (ISNULL(MaxStock, MinStock) - CurrentStock) * ISNULL(LastPrice, 0) ELSE 0 END as EstimatedCost
            FROM dbo.Stock_Products
            WHERE IsActive = 1 AND CurrentStock <= MinStock
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Forecast Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};
