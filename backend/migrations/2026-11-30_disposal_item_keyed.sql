-- =====================================================
-- IT Asset Disposal - สถานะ "กรอกลงระบบบัญชีแล้ว" ของแต่ละรายการ
-- IsKeyed = 1 เมื่อกรอกรายการนี้ลงเอกสารบัญชีแล้ว, KeyedAt/KeyedBy = เวลาและผู้กรอกล่าสุด
-- Created: 2026-11-30
-- =====================================================

IF COL_LENGTH(N'dbo.Disposal_Items', N'IsKeyed') IS NULL
BEGIN
    ALTER TABLE dbo.Disposal_Items ADD
        IsKeyed      BIT           NOT NULL CONSTRAINT DF_Disposal_Items_IsKeyed DEFAULT 0,
        KeyedAt      DATETIME      NULL,
        KeyedBy      NVARCHAR(100) NULL,
        KeyedByName  NVARCHAR(150) NULL;
    PRINT 'Added keyed columns to Disposal_Items';
END
GO
