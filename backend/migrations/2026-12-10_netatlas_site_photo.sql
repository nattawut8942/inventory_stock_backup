-- =====================================================
-- NetAtlas — รูปหน้างาน (SitePhotoFile) คู่กับรูปอุปกรณ์ (PhotoFile เดิม)
-- Created: 2026-12-10
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'SitePhotoFile') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD SitePhotoFile NVARCHAR(260) NULL;
    PRINT 'Added SitePhotoFile';
END
GO
