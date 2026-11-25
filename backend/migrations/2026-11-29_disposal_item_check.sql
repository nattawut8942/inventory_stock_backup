-- =====================================================
-- IT Asset Disposal - ตรวจนับรายการในรอบก่อนทิ้ง (สแกนป้าย QR / Barcode)
-- IsChecked = 1 เมื่อตรวจพบแล้ว, CheckedAt/CheckedBy = เวลาและผู้ตรวจล่าสุด
-- Created: 2026-11-29
-- =====================================================

IF COL_LENGTH(N'dbo.Disposal_Items', N'IsChecked') IS NULL
BEGIN
    ALTER TABLE dbo.Disposal_Items ADD
        IsChecked     BIT           NOT NULL CONSTRAINT DF_Disposal_Items_IsChecked DEFAULT 0,
        CheckedAt     DATETIME      NULL,
        CheckedBy     NVARCHAR(100) NULL,
        CheckedByName NVARCHAR(150) NULL;
    PRINT 'Added check columns to Disposal_Items';
END
GO
