-- =====================================================
-- Migration: Add factory layout position to Printers (Printer Health)
-- ใช้สำหรับวาง printer บนแผนผัง PC LAYOUT
-- =====================================================

-- แผนผังที่ printer นี้อยู่ (dbo.factory_layouts.id)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Printers' AND COLUMN_NAME = 'FactoryLayoutID')
BEGIN
    ALTER TABLE dbo.Printers ADD FactoryLayoutID INT NULL;
END;

-- พิกัด X/Y เป็นเปอร์เซ็นต์ของรูปแผนผัง (เหมือน info_pc_inventory.location_x/y)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Printers' AND COLUMN_NAME = 'LocationX')
BEGIN
    ALTER TABLE dbo.Printers ADD LocationX FLOAT NULL;
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Printers' AND COLUMN_NAME = 'LocationY')
BEGIN
    ALTER TABLE dbo.Printers ADD LocationY FLOAT NULL;
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Printers' AND COLUMN_NAME = 'LocationUpdatedAt')
BEGIN
    ALTER TABLE dbo.Printers ADD LocationUpdatedAt DATETIME2 NULL;
END;
