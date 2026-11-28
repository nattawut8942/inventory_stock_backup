-- =====================================================
-- NetAtlas — รูปแบบชื่อพอร์ตของอุปกรณ์ (เช่น "Gi1/0/" → Gi1/0/23)
-- ชื่อพอร์ตบนเส้นเชื่อมมาจากพอร์ตที่เลือกจริง ไม่ต้องพิมพ์เอง
-- Created: 2026-12-12
-- =====================================================

IF COL_LENGTH(N'dbo.NetAtlas_Devices', N'PortPrefix') IS NULL
BEGIN
    ALTER TABLE dbo.NetAtlas_Devices ADD PortPrefix NVARCHAR(40) NULL;
    PRINT 'Added PortPrefix';
END
GO
