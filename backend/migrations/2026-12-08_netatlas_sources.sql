-- =====================================================
-- NetAtlas — ดึงเครื่องจริงจาก PC Inventory / Monitor (MO) inventory มาเป็นอุปกรณ์ประเภท PC
-- RequiresSource : ประเภทนี้ต้องผูกกับเครื่องจากตารางต้นทาง (ไม่กรอกชื่อเอง)
-- SourceTable    : 'PC' = info_pc_inventory, 'MO' = info_mo_inventory
-- SourceHostname : hostname ของเครื่อง (เครื่องหนึ่งวางได้ในผังเดียวเท่านั้น)
-- Created: 2026-12-08
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_DeviceTypes', N'RequiresSource') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_DeviceTypes ADD RequiresSource BIT NOT NULL CONSTRAINT DF_NetAtlas_DT_ReqSrc DEFAULT 0;
    PRINT 'Added RequiresSource';
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NetAtlas_DeviceTypes WHERE Code = 'PC')
    INSERT INTO dbo.NetAtlas_DeviceTypes (Code, Label, ShortLabel, ColorKey, IconKey, HasPorts, CanBeParent, SortOrder, RequiresSource)
    VALUES ('PC', N'PC', N'PC', 'cyan', 'monitor', 0, 0, 4, 1);
GO

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'SourceTable') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD SourceTable VARCHAR(10) NULL, SourceHostname NVARCHAR(100) NULL;
    PRINT 'Added SourceTable, SourceHostname';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_NetAtlas_Devices_SourceTable')
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD CONSTRAINT CK_NetAtlas_Devices_SourceTable
        CHECK (SourceTable IS NULL OR SourceTable IN ('PC', 'MO'));
    PRINT 'Added CK_NetAtlas_Devices_SourceTable';
END
GO

-- เครื่องหนึ่งเครื่องวางได้ครั้งเดียวทั้งระบบ
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_NetAtlas_Devices_SourceHostname')
BEGIN
    CREATE UNIQUE INDEX UX_NetAtlas_Devices_SourceHostname
        ON dbo.NetAtlas_Devices (SourceHostname)
        WHERE SourceHostname IS NOT NULL;
    PRINT 'Created UX_NetAtlas_Devices_SourceHostname';
END
GO
