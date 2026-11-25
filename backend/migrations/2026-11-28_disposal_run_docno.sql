-- =====================================================
-- IT Asset Disposal - เลขเอกสารบัญชี "ของรอบ" (ย้ายจากระดับรายการมาที่ Disposal_Runs)
-- ย้ายคอลัมน์ AccountingDocNo จาก Disposal_Items (เพิ่มเมื่อ 2026-11-27) มาไว้ที่ Disposal_Runs
-- ถ้า Disposal_Items.AccountingDocNo มีข้อมูลอยู่แล้ว จะไม่ลบคอลัมน์นั้นให้ (ต้องตรวจสอบก่อน)
-- Created: 2026-11-28
-- =====================================================

IF COL_LENGTH(N'dbo.Disposal_Runs', N'AccountingDocNo') IS NULL
BEGIN
    ALTER TABLE dbo.Disposal_Runs ADD AccountingDocNo NVARCHAR(50) NULL;
    PRINT 'Added AccountingDocNo to Disposal_Runs';
END
GO

IF COL_LENGTH(N'dbo.Disposal_Items', N'AccountingDocNo') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.Disposal_Items WHERE AccountingDocNo IS NOT NULL)
        RAISERROR(N'Disposal_Items.AccountingDocNo มีข้อมูลอยู่ ไม่ลบให้อัตโนมัติ', 16, 1);
    ELSE
    BEGIN
        ALTER TABLE dbo.Disposal_Items DROP COLUMN AccountingDocNo;
        PRINT 'Dropped AccountingDocNo from Disposal_Items (was empty)';
    END
END
GO
