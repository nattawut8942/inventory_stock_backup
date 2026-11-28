-- =====================================================
-- NetAtlas — จำนวนพอร์ตของ Switch/Hub และการผูกอุปกรณ์ลูกกับหมายเลขพอร์ต
-- PortCount    : จำนวนพอร์ตของ Switch L2 / Hub L1 (AP ไม่ต้องกำหนด)
-- ParentPortNo : อุปกรณ์ลูกเสียบอยู่พอร์ตที่เท่าไรของ parent (1..PortCount)
-- Created: 2026-12-04
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'PortCount') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD PortCount INT NULL;
    PRINT 'Added PortCount';
END
GO

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'ParentPortNo') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD ParentPortNo INT NULL;
    PRINT 'Added ParentPortNo';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_NetAtlas_Devices_PortCount')
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD CONSTRAINT CK_NetAtlas_Devices_PortCount
        CHECK (PortCount IS NULL OR (PortCount BETWEEN 1 AND 96));
    PRINT 'Added CK_NetAtlas_Devices_PortCount';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_NetAtlas_Devices_ParentPort')
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD CONSTRAINT CK_NetAtlas_Devices_ParentPort
        CHECK (ParentPortNo IS NULL OR ParentPortNo >= 1);
    PRINT 'Added CK_NetAtlas_Devices_ParentPort';
END
GO

-- พอร์ตหนึ่งของ parent เสียบได้อุปกรณ์ลูกเพียงตัวเดียว
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_NetAtlas_Devices_ParentPort')
BEGIN
    CREATE UNIQUE INDEX UX_NetAtlas_Devices_ParentPort
        ON dbo.NetAtlas_Devices (UplinkDeviceID, ParentPortNo)
        WHERE UplinkDeviceID IS NOT NULL AND ParentPortNo IS NOT NULL;
    PRINT 'Created UX_NetAtlas_Devices_ParentPort';
END
GO
