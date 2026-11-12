-- =====================================================
-- Migration: Add warranty columns to info_pc_inventory
-- =====================================================

-- Warranty package (e.g. "Onsite 3 ปี")
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'warranty_package')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD warranty_package NVARCHAR(255) NULL;
END;

-- Warranty expiry date
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'warranty_expire_date')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD warranty_expire_date DATE NULL;
END;
