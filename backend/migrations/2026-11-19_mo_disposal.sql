-- Monitor Inventory (info_mo_inventory): สถานะการทำลาย (disposal) แยกจาก pc_status
IF COL_LENGTH('dbo.info_mo_inventory', 'disposal_status') IS NULL
    ALTER TABLE dbo.info_mo_inventory ADD disposal_status VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.info_mo_inventory', 'disposed_at') IS NULL
    ALTER TABLE dbo.info_mo_inventory ADD disposed_at DATETIME NULL;
GO
IF COL_LENGTH('dbo.info_mo_inventory', 'disposed_by') IS NULL
    ALTER TABLE dbo.info_mo_inventory ADD disposed_by NVARCHAR(120) NULL;
GO
IF COL_LENGTH('dbo.info_mo_inventory', 'disposal_note') IS NULL
    ALTER TABLE dbo.info_mo_inventory ADD disposal_note NVARCHAR(300) NULL;
GO
