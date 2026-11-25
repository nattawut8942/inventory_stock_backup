-- =====================================================
-- IT Asset Disposal - เลขเอกสารบัญชี ผูกกับแต่ละรายการ (เพิ่มคอลัมน์ใน Disposal_Items)
-- ใช้อ้างอิงกับเอกสารของฝ่ายบัญชี และแสดงบนป้ายที่พิมพ์
-- Created: 2026-11-27
-- =====================================================

IF COL_LENGTH(N'dbo.Disposal_Items', N'AccountingDocNo') IS NULL
BEGIN
    ALTER TABLE dbo.Disposal_Items ADD
        AccountingDocNo NVARCHAR(50) NULL;
    PRINT 'Added AccountingDocNo to Disposal_Items';
END
GO
