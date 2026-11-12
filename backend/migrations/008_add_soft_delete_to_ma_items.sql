-- =====================================================
-- Migration: Soft delete for MA_Items
-- ลบรายการ MA ด้วยการทำเครื่องหมาย IsDeleted แทนการ DELETE จริง
-- =====================================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'IsDeleted')
BEGIN
    ALTER TABLE dbo.MA_Items ADD IsDeleted BIT NOT NULL CONSTRAINT DF_MA_Items_IsDeleted DEFAULT 0;
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_Items' AND COLUMN_NAME = 'DeletedAt')
BEGIN
    ALTER TABLE dbo.MA_Items ADD DeletedAt DATETIME2 NULL;
END;
