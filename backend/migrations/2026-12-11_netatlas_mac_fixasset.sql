-- =====================================================
-- NetAtlas — MAC Address และ Fix Asset ของอุปกรณ์ (กรอกเองสำหรับอุปกรณ์ทั่วไป
-- เครื่องจาก PC / Monitor inventory จะดึงค่าจากตารางต้นทางโดยตรง)
-- Created: 2026-12-11
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'MacAddress') IS NULL
    ALTER TABLE dbo.NetAtlas_Devices ADD MacAddress NVARCHAR(40) NULL;
GO
IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'FixAsset') IS NULL
    ALTER TABLE dbo.NetAtlas_Devices ADD FixAsset NVARCHAR(60) NULL;
GO
