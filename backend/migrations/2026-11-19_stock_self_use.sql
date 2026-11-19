-- เบิกใช้เอง (ผู้ login = ผู้รับ): แยกประเภทเพื่อใช้ในรายงาน
IF COL_LENGTH('dbo.Stock_Transactions', 'SelfUse') IS NULL
    ALTER TABLE dbo.Stock_Transactions ADD SelfUse BIT NULL;
GO
