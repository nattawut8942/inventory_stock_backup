-- เหตุผลการเบิก: ปิดการใช้งานแทนการลบ (ประวัติเดิมยังอ้างอิงได้)
IF COL_LENGTH('dbo.Stock_WithdrawalReasons', 'IsActive') IS NULL
    ALTER TABLE dbo.Stock_WithdrawalReasons ADD IsActive BIT NOT NULL CONSTRAINT DF_Stock_WithdrawalReasons_IsActive DEFAULT 1;
GO
