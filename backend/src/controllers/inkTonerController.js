import { getDciPool } from '../config/dciDb.js';

// GET Ink & Toner Stock from DCI Database
export const getInkTonerStock = async (req, res) => {
    try {
        const pool = getDciPool();
        const result = await pool.request().query(`
            SELECT [Prt_Code]
                  ,[Prt_Name]
                  ,[Spect]
                  ,[SaftyStock]
                  ,[Minimum]
                  ,[CurrentStock]
                  ,[Um]
                  ,[Vender]
            FROM [dbDCI].[dbo].[SP_PartSock]
            WHERE Prt_Code LIKE '6CC-ITP%'
            ORDER BY Prt_Name
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Ink & Toner Stock Error:', err);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูล Ink & Toner Stock ได้' });
    }
};
