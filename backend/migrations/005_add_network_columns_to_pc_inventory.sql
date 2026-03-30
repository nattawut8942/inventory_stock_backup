-- =====================================================
-- Migration: Add wifi_ssid and adapter_type to info_pc_inventory
-- Date: 2026-02-20
-- =====================================================

-- Add wifi_ssid column if not exists
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'wifi_ssid')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD wifi_ssid NVARCHAR(255) NULL;
END;

-- Add adapter_type column if not exists
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'adapter_type')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD adapter_type NVARCHAR(100) NULL;
END;

-- Add category column for PC inventory detail page
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'category')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD category NVARCHAR(100) NULL;
END;

-- Add brand column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'brand')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD brand NVARCHAR(100) NULL;
END;

-- Add asset_tag column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'asset_tag')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD asset_tag NVARCHAR(50) NULL;
END;

-- Add status column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'status')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD status NVARCHAR(50) NULL DEFAULT 'Active';
END;

-- Add location column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'location')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD location NVARCHAR(255) NULL;
END;

-- Add [user] column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'user')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD [user] NVARCHAR(255) NULL;
END;

-- Add remark column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'remark')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD remark NVARCHAR(MAX) NULL;
END;

-- Add purchase_date column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'info_pc_inventory' AND COLUMN_NAME = 'purchase_date')
BEGIN
    ALTER TABLE dbo.info_pc_inventory ADD purchase_date DATETIME NULL;
END;

-- Create index on hostname
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_pc_inventory_hostname' AND object_id = OBJECT_ID('dbo.info_pc_inventory'))
BEGIN
    CREATE INDEX IX_pc_inventory_hostname ON dbo.info_pc_inventory(hostname);
END;

-- Create index on asset_tag
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_pc_inventory_asset_tag' AND object_id = OBJECT_ID('dbo.info_pc_inventory'))
BEGIN
    CREATE INDEX IX_pc_inventory_asset_tag ON dbo.info_pc_inventory(asset_tag);
END;
