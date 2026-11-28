-- =====================================================
-- NetAtlas — รูปของอุปกรณ์ (แสดงตอนชี้เมาส์บนหมุดบนผัง)
-- PhotoFile : ชื่อไฟล์ใน backend/uploads/netatlas-devices (ไม่เก็บ base64)
-- Created: 2026-12-09
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'PhotoFile') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD PhotoFile NVARCHAR(260) NULL;
    PRINT 'Added PhotoFile';
END
GO
